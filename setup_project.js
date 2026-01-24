const fs = require('fs');
const path = require('path');

try {
  const data = fs.readFileSync('code-assets.json', 'utf8');
  const json = JSON.parse(data);
  const files = json.files;

  if (!files) {
    console.log('No files found in JSON.');
    process.exit(0);
  }

  console.log(`Found ${Object.keys(files).length} files to create.`);

  for (const [filePath, content] of Object.entries(files)) {
    const absolutePath = path.resolve(filePath);
    const directory = path.dirname(absolutePath);

    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }

    fs.writeFileSync(absolutePath, content);
    console.log(`Created: ${filePath}`);
  }

  console.log('Project setup complete.');

} catch (err) {
  console.error('Error setting up project:', err);
}
