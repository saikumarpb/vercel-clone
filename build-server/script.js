const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const mime = require('mime-types');

const PROJECT_ID = process.env.PROJECT_ID;

const s3Client = new S3Client({
    region: 'ap-south-1',
    credentials: {
        accessKeyId: 'AKIAVBYWDB7HPRUXLKH2',
        secretAccessKey: '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',
    },
});

async function init() {
    console.log('Executing script.js');

    const outDirPath = path.join(__dirname, 'output');

    const p = exec(`cd ${outDirPath} && npm install && npm run build`);
    p.stdout.on('data', (data) => {
        console.log(data.toString());
    });

    p.stdout.on('error', (data) => {
        console.log('Error', data.toString());
    });

    p.stdout.on('close', async () => {
        console.log('Build complete');

        const distFolderPath = path.join(__dirname, 'output', 'dist');
        const distFolderContents = fs.readdirSync(distFolderPath, {
            recursive: true,
        });

        for (const file of distFolderContents) {
            const filePath = path.join(distFolderPath, file);
            if (fs.lstatSync(filePath).isDirectory()) continue;

            console.log('Uploading ', filePath);
            const command = new PutObjectCommand({
                Bucket: 'clone-vercel',
                Key: `__outputs/${PROJECT_ID}/${file}`,
                Body: fs.createReadStream(filePath),
                ContentType: mime.lookup(filePath),
            });

            await s3Client.send(command);
            console.log('Uploaded ', filePath);
        }

        console.log('Done...');
    });
}

init();
