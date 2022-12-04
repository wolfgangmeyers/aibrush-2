import * as AWS from 'aws-sdk';
import fs from 'fs';

export interface Filestore {
    exists(filename: string): Promise<boolean>;
    readFile(filename: string): Promise<string>;
    writeFile(filename: string, data: string |  Buffer, downloadAs?: string): Promise<void>;
    readBinaryFile(filename: string): Promise<Buffer>;
    deleteFile(filename: string): Promise<void>;
    getDownloadUrl(filename: string): Promise<string>;
    getUploadUrl(filename: string): Promise<string>;
}

export class S3Filestore implements Filestore {
    private readonly s3: AWS.S3;
    private readonly bucket: string;

    constructor(bucket: string, region: string) {
        this.s3 = new AWS.S3({
            region: region,
        });
        this.bucket = bucket;
    }

    getDownloadUrl(filename: string): Promise<string> {
        return this.s3.getSignedUrlPromise('getObject', {
            Bucket: this.bucket,
            Key: filename,
            Expires: 60 * 60 * 1
        });
    }

    getUploadUrl(filename: string): Promise<string> {
        return this.s3.getSignedUrlPromise('putObject', {
            Bucket: this.bucket,
            Key: filename,
            Expires: 60 * 60 * 1
        });
    }

    async exists(filename: string): Promise<boolean> {
        try {
            await this.s3.headObject({
                Bucket: this.bucket,
                Key: filename
            }).promise();
            return true;
        } catch (e) {
            return false;
        }
    }

    async readFile(filename: string): Promise<string> {
        const data = await this.s3.getObject({
            Bucket: this.bucket,
            Key: filename
        }).promise();
        return data.Body.toString('utf-8');
    }

    async writeFile(filename: string, data: string | Buffer, downloadAs?: string): Promise<void> {
        const input: AWS.S3.PutObjectRequest = {
            Bucket: this.bucket,
            Key: filename,
            Body: data,
        }
        if (filename.endsWith(".mp4")) {
            input.ContentType = "video/mp4";
        }
        if (downloadAs) {
            input.ContentDisposition = `attachment; filename="${downloadAs}"`;
        }
        await this.s3.putObject(input).promise();
    }

    async readBinaryFile(filename: string): Promise<Buffer> {
        const data = await this.s3.getObject({
            Bucket: this.bucket,
            Key: filename
        }).promise();
        return data.Body as Buffer;
    }

    async deleteFile(filename: string): Promise<void> {
        await this.s3.deleteObject({
            Bucket: this.bucket,
            Key: filename
        }).promise();
    }
}

export class LocalFilestore implements Filestore {

    constructor(private dataFolderName: string) {
        if (!fs.existsSync(dataFolderName)) {
            fs.mkdirSync(dataFolderName);
        }
    }

    getDownloadUrl(filename: string): Promise<string> {
        return null;
    }

    getUploadUrl(filename: string): Promise<string> {
        return null;
    }

    async exists(filename: string): Promise<boolean> {
        return fs.existsSync(`${this.dataFolderName}/${filename}`);
    }

    async readFile(filename: string): Promise<string> {
        return fs.readFileSync(`${this.dataFolderName}/${filename}`, 'utf-8');
    }

    async writeFile(filename: string, data: string | Buffer): Promise<void> {
        fs.writeFileSync(`${this.dataFolderName}/${filename}`, data);
    }

    async readBinaryFile(filename: string): Promise<Buffer> {
        return fs.readFileSync(`${this.dataFolderName}/${filename}`);
    }

    async deleteFile(filename: string): Promise<void> {
        fs.unlinkSync(`${this.dataFolderName}/${filename}`);
    }
}