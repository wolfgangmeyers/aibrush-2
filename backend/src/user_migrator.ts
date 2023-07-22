import { S3 } from "aws-sdk";
import { v4 as uuidv4 } from "uuid";
import { BackendService } from "./backend";
import { hash } from "./auth";
import { User } from "./client";

export class Migrator {
    constructor(
        private backend: BackendService,
        private s3: S3,
        private bucket: string
    ) {
        this.backend = backend;
        this.s3 = s3;
    }

    async migrateUserImages(userId: string) {
        userId = hash(userId);
        const user = await this.backend.getUser(userId);

        // Do nothing if user already has a manifest_id
        if (user && user.manifest_id) {
            console.log(
                `User ${userId} already has a manifest_id. Operation skipped.`
            );
            return;
        }

        const manifestId = uuidv4() + uuidv4(); // Generate a new unique UUID
        let imageIds = [];
        let cursor: number | undefined = 0;
        const totalImages = await this.backend.countImagesForUser(userId);
        let processedImages = 0;

        // Paginate through every image for the user
        do {
            const imagePage = await this.backend.listImages({
                userId,
                cursor,
                limit: 100,
                direction: "asc",
            });
            imageIds = [
                ...imageIds,
                ...(imagePage.images || []).map((image) => image.id),
            ];

            // Save images to S3
            const promises: Promise<any>[] = [];
            for (let image of imagePage.images || []) {
                // console.log(`Saving image ${image.id} to S3`);
                promises.push(
                    this.s3
                        .putObject({
                            Bucket: this.bucket,
                            Key: `${image.id}.json`,
                            Body: JSON.stringify(image),
                        })
                        .promise()
                );
            }
            await Promise.all(promises);
            if (!imagePage.images || imagePage.images.length === 0) {
                cursor = undefined;
            } else {
                // set cursor to the max updated_at value of the images on the page
                cursor =
                    Math.max(
                        ...(imagePage.images || []).map(
                            (image) => image.updated_at
                        )
                    ) + 1;
            }
            processedImages += imagePage.images?.length || 0;
            console.log(
                `Processed ${processedImages} of ${totalImages} images for user ${userId}`
            );
        } while (cursor !== undefined);

        // Create a manifest with the list of image ids
        const manifest = {
            imageIds: imageIds,
        };

        console.log(`Saving manifest ${manifestId} to S3`);
        // Save the manifest to S3
        await this.s3
            .putObject({
                Bucket: this.bucket,
                Key: `${manifestId}.json`,
                Body: JSON.stringify(manifest),
            })
            .promise();

        // Update the user with the new manifest_id
        await this.backend.setUserManifestId(userId, manifestId);

        console.log(`Images for user ${userId} successfully migrated.`);
    }

    async migrateAllUsers() {
        const allUsers = await this.backend.listAllUsers();
        for (let user of allUsers) {
            await this.migrateUserImages(user.id);
        }
    }

    async notifyUser(user: User) {
        const count = await this.backend.countImagesForUser(user.id);
        if (count === 0) {
            return;
        }
        const emailTemplate = `
Hello AiBrush user,

AiBrush has transitioned into being a static website, so you will need the following link to view your saved images:

https://www.aibrush.art?manifest_id=${user.manifest_id}

Once you visit this link with a device, your saved images should be available on that device going forward.
Make sure to keep this link safe in case you need to need to access your saved images from other devices.
In an upcoming release, AiBrush will be integrated with Google Drive so that you can save images to your own
account, and will offer a way to migrate your saved iamges to Google Drive.

Sorry for the inconvenience, but these changes will help eliminate maintenance costs and allow AiBrush to remain available.

Thanks for being an AiBrush user!
`;
        console.log(`Sending email to ${user.email}`);
        // await this.backend.sendMail(user.email, "AiBrush Update", emailTemplate);
        await this.backend.sendMail({
            from: "AiBrush <admin@aibrush.art>",
            to: user.email,
            subject: "AiBrush Saved Images Link",
            text: emailTemplate,
        });
    }

    async notifyAllUsers() {
        // explain that users no longer need to log in

        const allUsers = await this.backend.listAllUsers();
        // make sure they have some saved images.
        for (let user of allUsers) {
            await this.notifyUser(user);
        }
    }
}
