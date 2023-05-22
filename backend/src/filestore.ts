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
    copyFile(source: string, target: string): Promise<void>;
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

    async copyFile(source: string, target: string): Promise<void> {
        return this.s3.copyObject({
            Bucket: this.bucket,
            CopySource: `${this.bucket}/${source}`,
            Key: target,
        }).promise().then(() => {});
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
            Expires: 60 * 60 * 1,
            ContentType: filename.endsWith(".jpg") ? "image/jpeg" : "image/png",
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

    async copyFile(source: string, target: string): Promise<void> {
        fs.copyFileSync(this.getFilename(source), this.getFilename(target));
    }

    async getDownloadUrl(filename: string): Promise<string> {
        return `http://localhost:3000/api/images/${filename}`;
    }

    async getUploadUrl(filename: string): Promise<string> {
        return `http://localhost:3000/api/images/${filename}`;
    }

    private getFilename(filename: string): string {
        if (filename.startsWith("tmp/")) {
            return `/${filename}`;
        }
        return `${this.dataFolderName}/${filename}`;
    }

    async exists(filename: string): Promise<boolean> {
        return fs.existsSync(this.getFilename(filename));
    }

    async readFile(filename: string): Promise<string> {
        return fs.readFileSync(this.getFilename(filename), 'utf-8');
    }

    async writeFile(filename: string, data: string | Buffer): Promise<void> {
        fs.writeFileSync(this.getFilename(filename), data);
    }

    async readBinaryFile(filename: string): Promise<Buffer> {
        return fs.readFileSync(this.getFilename(filename));
    }

    async deleteFile(filename: string): Promise<void> {
        fs.unlinkSync(this.getFilename(filename));
    }
}