import { ImageStatusEnum } from "../client/api";

// map from image status to font awesome class
// possible values: Pending, Processing, Completed, Saved
export const imageStatusToIconClass = (status: ImageStatusEnum) => {
    switch (status) {
        case ImageStatusEnum.Pending:
            return "fas fa-hourglass-start";
        case ImageStatusEnum.Processing:
            return "fas fa-cog fa-spin";
        case ImageStatusEnum.Completed:
            return "fas fa-check";
        case ImageStatusEnum.Saved:
            return "fas fa-save";
        default:
            return "";
    }
}