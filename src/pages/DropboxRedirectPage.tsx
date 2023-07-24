import React, { useEffect } from 'react';
import DropboxHelper from '../lib/dropbox';  // adjust the path as needed
import { Dropbox } from 'dropbox';

interface DropboxRedirectPageProps {
  onDropboxReady: (dropbox: Dropbox) => void;
}

const DropboxRedirectPage: React.FC<DropboxRedirectPageProps> = ({ onDropboxReady }) => {
  useEffect(() => {
    const dropboxHelper = new DropboxHelper();
    dropboxHelper.handleRedirect()
      .then(dropbox => {
        if (dropbox) {
          onDropboxReady(dropbox);
        }
      })
      .catch(error => console.error(error));
  }, [onDropboxReady]);

  return (
    <div>
      <p>Processing Dropbox authentication...</p>
    </div>
  );
};

export default DropboxRedirectPage;
