const fs = require('fs');
const path = require('path');

// Lê o último DOCX
const reportsDir = './uploads/reports';
const files = fs.readdirSync(reportsDir)
  .filter(f => f.endsWith('.docx'))
  .sort((a, b) => fs.statSync(path.join(reportsDir, b)).mtime - fs.statSync(path.join(reportsDir, a)).mtime);

if (files.length === 0) {
  console.log('Nenhum DOCX encontrado');
  process.exit(1);
}

const filePath = path.join(reportsDir, files[0]);
console.log('Analisando:', filePath);

// Lê como buffer e busca strings
const buffer = fs.readFileSync(filePath);
const content = buffer.toString('utf-8', 0, buffer.length);

const searches = [
  'Item avaliado',
  'Arquivos',
  'ANEXO',
  'pld-janeiro',
  '4.1',
  'CONCLUS'
];

console.log('\n--- Buscas no DOCX ---');
searches.forEach(term => {
  const found = content.includes(term);
  console.log(`${term}: ${found ? 'ENCONTRADO' : 'NÃO ENCONTRADO'}`);
});

// Conta tabelas (w:tbl)
const tableMatches = content.match(/w:tbl/g);
console.log(`\nTotal de marcadores de tabela (w:tbl): ${tableMatches ? tableMatches.length : 0}`);
