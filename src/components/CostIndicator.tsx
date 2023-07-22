import { FC } from "react";

interface Props {
    imagesCost: number;
}

//TODO: restore when doing kudos cost calculation
export const CostIndicator: FC<Props> = ({ imagesCost }) => {
    return (
        // <div style={{ textAlign: "left" }}>
        //     <span className="helptext" style={{ color: "#00f0f0" }}>
        //         Cost: {imagesCost} credit{imagesCost > 1 ? "s" : ""}&nbsp;
        //         <i
        //             className="fas fa-info-circle"
        //             style={{ cursor: "pointer" }}
        //             onClick={() =>
        //                 alert(
        //                     "The cost is based on the image count and the size of each image. A single 512x512 image costs 1 credit."
        //                 )
        //             }
        //         ></i>
        //     </span>
        // </div>
        <></>
    );
};
