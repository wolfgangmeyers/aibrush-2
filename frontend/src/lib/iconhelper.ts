import { ImageStatusEnum, SuggestionsJobStatusEnum } from "../client/api";

// map from image status to font awesome class
// possible values: Pending, Processing, Completed, Saved
export const imageStatusToIconClass = (status: ImageStatusEnum | SuggestionsJobStatusEnum) => {
    switch (status) {
        case "pending":
            return "fas fa-hourglass-start";
        case "processing":
            return "fas fa-cog fa-spin";
        case "completed":
            return "fas fa-check";
        case "saved":
            return "fas fa-save";
        default:
            return "";
    }
}