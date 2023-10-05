require('dotenv').config();
const http = require("http");
const path = require("path");
const fs = require('fs');
const { Buffer } = require("buffer");
const { S3Client } = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");
const { PassThrough } = require("stream");

const port = 8088;

const getMimeType = (ext) => {
    const types = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
        ".pdf": "application/pdf",
        ".mp4": "video/mp4",
        ".doc": "application/msword",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    };
    return types[ext.toLowerCase()] || "application/octet-stream";
};

let region = process.env.AWS_REGION;
let accessKey = process.env.AWS_ACCESS_KEY_ID;
let secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
let s3_bucket = process.env.S3_BUCKET_NAME;

const s3 = new S3Client({
    region: region,
    credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretAccessKey
    },
});

const server = http.createServer((req, res) => {
    console.log(`Received request: ${req.method} ${req.url}`);

    if (req.method === "OPTIONS") {
        res.writeHead(204);
        return res.end();
    }

    if (["POST", "PUT"].includes(req.method)) {
        let body = [];
        req.on("data", (chunk) => body.push(chunk));
        req.on("end", async () => {
            body = Buffer.concat(body).toString();
            console.log(`Received body data: ${body}`);

            let mypath = '/content/dam/tom/asset.jpg';
            await handleFileUpload(mypath);
            res.end();
        });
        return;
    }

    res.writeHead(405);
    res.end(`${req.method} is not allowed for the request.`);
});

async function handleFileUpload(filedown) {
    try {
        console.log(`Handling file upload for ${filedown}`);

        const encodedCredentials = Buffer.from('admin:admin').toString('base64');

        const options = {
            hostname: 'localhost',
            port: 4502,
            path: filedown,
            headers: {
                'Authorization': 'Basic ' + encodedCredentials
            }
        };

        const fileExt = path.extname(filedown);
        const mimeType = getMimeType(fileExt);

        const response = await new Promise((resolve, reject) => {
            const req = http.get(options, (res) => {
                console.log(`Received response with status code ${res.statusCode}`);

                if (res.statusCode !== 200) {
                    return reject(new Error(`Request failed with status: ${res.statusCode}`));
                }
                resolve(res);
            });

            req.on('error', (e) => {
                console.error(`Request failed: ${e}`);
                reject(e);
            });
        });

        const localFilePath = `./local${fileExt}`;
        const localFile = fs.createWriteStream(localFilePath);

        response.pipe(localFile);

        await new Promise((resolve, reject) => {
            localFile.on('finish', resolve);
            localFile.on('error', reject);
        });

        const localFileStream = fs.createReadStream(localFilePath);

        const uploadParams = {
            Bucket: s3_bucket,
            Key: `myfile${fileExt}`,
            Body: localFileStream,
            ContentType: mimeType
        };

        const uploader = new Upload({
            client: s3,
            params: uploadParams
        });

        await uploader.done;

        console.log(`Successfully uploaded file.`);
    } catch (error) {
        console.error(`An error occurred: ${error}`);
    }
}

server.listen(port, () => {
    console.log(`Server is listening on port ${port}`);
});
