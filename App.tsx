import React, { useState } from 'react';
import { Scene3D } from './components/Scene3D';
import { UILayer } from './components/UILayer';

const App: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [uiHidden, setUiHidden] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<FileList | null>(null);

  const handleLoadComplete = () => {
    setLoading(false);
  };

  const handleUpload = (files: FileList) => {
    setUploadedFiles(files);
  };

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden select-none">
      <Scene3D 
        onLoadComplete={handleLoadComplete} 
        newUploads={uploadedFiles}
      />
      
      <UILayer 
        isLoading={loading}
        onUpload={handleUpload}
        isHidden={uiHidden}
        toggleVisibility={() => setUiHidden(!uiHidden)}
      />
    </div>
  );
};

export default App;
