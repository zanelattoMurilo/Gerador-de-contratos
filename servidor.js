// Node.js >= 18. Execute apenas em localhost para testes com dados fictícios.
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { URL } = require('node:url');
const { createInterface } = require('node:readline/promises');

const APP_ID = '0c6ed35b-43d4-496c-8fb1-b75a02d871ba';
const HTML = path.join(__dirname, 'Gerador_de_Contrato_v2_6_HOMOLOGACAO.html');
const PORT = 3000;

async function iniciar() {
  let chave = process.env.APPSHEET_API_KEY;
  if (!chave) {
    const rl = createInterface({ input:process.stdin, output:process.stdout });
    chave = (await rl.question('Chave do AppSheet (não será salva): ')).trim();
    rl.close();
  }
  if (!chave) throw new Error('Chave obrigatória.');

  const server = http.createServer(async (req,res) => {
    const responder = (codigo,obj) => {
      res.writeHead(codigo, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
      res.end(JSON.stringify(obj));
    };
    try {
      const url = new URL(req.url,'http://localhost');
      if (req.method === 'GET' && url.pathname === '/') {
        const html = await fs.readFile(HTML);
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
        return res.end(html);
      }
      const match = /^\/api\/clientes\/([A-Za-z0-9_-]{1,40})$/.exec(url.pathname);
      if (req.method !== 'GET' || !match) return responder(404,{erro:'Rota não encontrada.'});
      const id = match[1];
      const endpoint = `https://www.appsheet.com/api/v2/apps/${APP_ID}/tables/Clientes/Action`;
      const response = await fetch(endpoint,{
        method:'POST',
        headers:{'Content-Type':'application/json', ApplicationAccessKey:chave},
        body:JSON.stringify({Action:'Find',Properties:{Locale:'pt-BR',Selector:`Filter(Clientes, [ID_Cliente] = "${id}")`},Rows:[]}),
        signal:AbortSignal.timeout(12000)
      });
      if (!response.ok) {
        console.error('AppSheet HTTP',response.status);
        return responder(502,{erro:'Falha ao consultar AppSheet (HTTP '+response.status+').'});
      }
      const data = await response.json();
      if (!Array.isArray(data)) return responder(502,{erro:'Resposta inesperada do AppSheet.'});
      const cliente = data.find(c=>String(c.ID_Cliente)===id);
      if (!cliente) return responder(404,{erro:'Cliente não encontrado.'});
      // Apenas atributos necessários ao formulário; não devolve chave de API.
      const campos = ['ID_Cliente','Nome_Completo','CPF','CEP','Rua','Numero','Bairro','Cidade','UF'];
      const limpo = Object.fromEntries(campos.map(k=>[k,cliente[k] ?? '']));
      return responder(200,{cliente:limpo});
    } catch(e) {
      console.error('Erro de consulta:',e.message);
      return responder(500,{erro:'Falha de comunicação. Verifique o terminal do servidor.'});
    }
  });
  server.listen(PORT,'127.0.0.1',()=>console.log(`Abra http://127.0.0.1:${PORT} no navegador`));
}
iniciar().catch(e=>{console.error(e.message);process.exitCode=1});
