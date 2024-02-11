const express = require('express');
const { generateSlug } = require('random-word-slugs');
const { ECSClient, RunTaskCommand } = require('@aws-sdk/client-ecs');
const dotenv = require('dotenv');
const { Server } = require('socket.io');
const Redis = require('ioredis');

// Load config
dotenv.config();

const app = express();
const PORT = 9000;
const SOCKET_PORT = 9001;

const redis = new Redis(process.env.REDIS_URI);

const wsServer = new Server({ cors: '*' });

wsServer.on('connection', (socket) => {
    socket.on('subscribe', (channel) => {
        socket.join(channel);
        socket.emit('message', `Joined ${channel}`);
    });
});

wsServer.listen(SOCKET_PORT, () =>
    console.log(`Socket server runnig on port ${SOCKET_PORT}`)
);

const ecsClient = new ECSClient({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_S3_ACCESS_KEY_SECRET,
    },
});

app.use(express.json());

app.post('/project', async (req, res) => {
    const { gitURL, slug } = req.body;

    const projectSlug = slug ? slug : generateSlug(1);

    const command = new RunTaskCommand({
        cluster: process.env.AWS_ECS_CLUSTER_ARN,
        taskDefinition: process.env.AWS_ECS_TASK_DEFINITION_ARN,
        count: 1,
        launchType: 'FARGATE',
        networkConfiguration: {
            awsvpcConfiguration: {
                assignPublicIp: 'ENABLED',
                subnets: [
                    'subnet-0bf2d7c4c548d9117',
                    'subnet-01abd9c5f5f100497',
                    'subnet-0b9c0276a7fb353f5',
                ],
                securityGroups: ['sg-0672a4900fbe1a423'],
            },
        },
        overrides: {
            containerOverrides: [
                {
                    name: process.env.AWS_ECR_IMAGE,
                    environment: [
                        { name: 'GIT_REPOSITORY_URL', value: gitURL },
                        { name: 'PROJECT_ID', value: projectSlug },
                    ],
                },
            ],
        },
    });

    await ecsClient.send(command);

    return res.json({
        status: 'queued',
        data: { projectSlug, url: `http://${projectSlug}.localhost:8000` },
    });
});

initRedisSubscribe();

app.listen(PORT, () => console.log(`Api server running on port: ${PORT}`));

async function initRedisSubscribe() {
    console.log('subscribed to logs');
    redis.psubscribe('logs:*');
    redis.on('pmessage', (pattern, channel, message) => {
        wsServer.to(channel).emit('message', message);
    });
}
