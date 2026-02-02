const fs = require('fs');
const AdmZip = require('adm-zip');

const files = fs.readdirSync('./uploads/reports')
  .filter(f => f.endsWith('.docx'))
  .sort((a, b) => fs.statSync('./uploads/reports/' + b).mtime - fs.statSync('./uploads/reports/' + a).mtime);

console.log('Arquivo:', files[0]);

const z = new AdmZip('./uploads/reports/' + files[0]);
const xml = z.readAsText('word/document.xml');

// Encontra a última ocorrência de ANEXO
const idx = xml.lastIndexOf('ANEXO EVID');
const section = xml.substring(idx);

// Extrai todos os textos
const texts = section.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
const cleanTexts = texts.map(t => t.replace(/<[^>]+>/g, ''));

console.log('\n=== TEXTOS NA SEÇÃO 6 ===');
cleanTexts.forEach((t, i) => console.log(i + ':', t));
