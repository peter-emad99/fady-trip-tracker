const fs = require('fs');
const path = require('path');

const PAGES_DIR = path.join(process.cwd(), 'src', 'pages');

if (fs.existsSync(PAGES_DIR)) {
    const files = fs.readdirSync(PAGES_DIR);
    files.forEach(f => {
        const filePath = path.join(PAGES_DIR, f);
        if (fs.statSync(filePath).isFile()) {
            if (!path.extname(f)) {
                const newName = f + '.jsx';
                fs.renameSync(filePath, path.join(PAGES_DIR, newName));
                console.log(`Renamed src/pages/${f} -> src/pages/${newName}`);
            }
        }
    });
}
