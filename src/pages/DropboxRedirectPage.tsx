import React, { useEffect } from 'react';
import DropboxHelper from '../lib/dropbox';  // adjust the path as needed
import { Dropbox } from 'dropbox';

interface DropboxRedirectPageProps {
  onDropboxReady: () => void;
}

const DropboxRedirectPage: React.FC<DropboxRedirectPageProps> = ({ onDropboxReady }) => {
  useEffect(() => {
    const storedApiKey = localStorage.getItem("apiKey");
    const dropboxHelper = new DropboxHelper(storedApiKey!);
    dropboxHelper.handleRedirect()
      .then(() => onDropboxReady())
      .catch(error => console.error(error));
  }, []);

  return (
    <div>
      <p>Processing Dropbox authentication...</p>
    </div>
  );
};

export default DropboxRedirectPage;
