import React, { FC, useState, useEffect } from "react";
import { ChromePicker } from "react-color";

// class ButtonExample extends React.Component {
//   state = {
//     displayColorPicker: false,
//   };

//   handleClick = () => {
//     this.setState({ displayColorPicker: !this.state.displayColorPicker })
//   };

//   handleClose = () => {
//     this.setState({ displayColorPicker: false })
//   };

//   render() {
//     const popover = {
//       position: 'absolute',
//       zIndex: '2',
//     }
//     const cover = {
//       position: 'fixed',
//       top: '0px',
//       right: '0px',
//       bottom: '0px',
//       left: '0px',
//     }
//     return (
//       <div>
//         <button onClick={ this.handleClick }>Pick Color</button>
//         { this.state.displayColorPicker ? <div style={ popover }>
//           <div style={ cover } onClick={ this.handleClose }/>
//           <ChromePicker />
//         </div> : null }
//       </div>
//     )
//   }
// }

interface Props {
    color: string;
    onColorSelected: (color: string) => void;
}

export const ColorPicker: FC<Props> = ({ color, onColorSelected }) => {
    const [displayColorPicker, setDisplayColorPicker] = useState(false);
    const [tmpColor, setTmpColor] = useState(color);

    const handleClick = () => {
        setDisplayColorPicker(!displayColorPicker);
        if (displayColorPicker) {
            onColorSelected(tmpColor);
        }
    };

    const handleClose = () => {
        setDisplayColorPicker(false);
        if (displayColorPicker) {
            onColorSelected(tmpColor);
        }
    };

    const popover: React.CSSProperties = {
        position: "absolute",
        zIndex: 2,
    };
    const cover: React.CSSProperties = {
        position: "fixed",
        top: "0px",
        right: "0px",
        bottom: "0px",
        left: "0px",
    };

    return (
        <>
            <button className="color-picker" onClick={handleClick}>
                <i className="fas fa-plus" />
            </button>
            {displayColorPicker ? (
                <div style={popover}>
                    <div style={cover} onClick={handleClose} />
                    <ChromePicker
                        color={tmpColor}
                        onChange={(color) => setTmpColor(color.hex)}
                        onChangeComplete={(color) => setTmpColor(color.hex)}
                    />
                </div>
            ) : null}
        </>
    );
};
