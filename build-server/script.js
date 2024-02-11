const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const mime = require('mime-types');
const dotenv = require('dotenv');
const Redis = require('ioredis');

// Load config
dotenv.config();

const PROJECT_ID = process.env.PROJECT_ID;

const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_S3_ACCESS_KEY_SECRET,
    },
});

const redis = new Redis(process.env.REDIS_URI);

function publishLog(log) {
    redis.publish(`logs:${PROJECT_ID}`, JSON.stringify(log));
}

async function init() {
    console.log('Executing script.js');
    publishLog('Build started');

    const outDirPath = path.join(__dirname, 'output');

    const p = exec(`cd ${outDirPath} && npm install && npm run build`);
    p.stdout.on('data', (data) => {
        console.log(data.toString());
        publishLog(data);
    });

    p.stdout.on('error', (data) => {
        console.log('Error', data.toString());
        publishLog(`Error: ${data}`);
    });

    p.stdout.on('close', async () => {
        console.log('Build complete');
        publishLog('Build complete');

        const distFolderPath = path.join(__dirname, 'output', 'dist');
        const distFolderContents = fs.readdirSync(distFolderPath, {
            recursive: true,
        });

        for (const file of distFolderContents) {
            const filePath = path.join(distFolderPath, file);
            if (fs.lstatSync(filePath).isDirectory()) continue;

            console.log('Uploading ', filePath);
            publishLog(`Uploading ${filePath}`);

            const command = new PutObjectCommand({
                Bucket: process.env.AWS_S3_BUCKET,
                Key: `__outputs/${PROJECT_ID}/${file}`,
                Body: fs.createReadStream(filePath),
                ContentType: mime.lookup(filePath),
            });

            await s3Client.send(command);
            console.log('Uploaded ', filePath);
            publishLog(`Uploaded ${filePath}`);
        }

        console.log('Done...');
        publishLog('Done');
    });
}

init();
