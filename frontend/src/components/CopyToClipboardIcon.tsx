import React, { useState } from 'react';
import { CopyToClipboard } from 'react-copy-to-clipboard';

interface CopyToClipboardIconProps {
  text: string;
}

const CopyToClipboardIcon: React.FC<CopyToClipboardIconProps> = ({ text }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 5000); // Reset icon after 5 seconds
  };

  return (
    <CopyToClipboard text={text} onCopy={handleCopy}>
      <span style={{cursor: "pointer", marginLeft: "8px"}}>
        {/* <FontAwesomeIcon icon={copied ? faCheck : faCopy} style={{ color: copied ? 'green' : undefined }} /> */}
        <i className={`fas fa-${copied ? 'check' : 'copy'}`} style={{ color: copied ? 'green' : undefined }} />
      </span>
    </CopyToClipboard>
  );
};

export default CopyToClipboardIcon;
