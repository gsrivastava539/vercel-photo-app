/**
 * Dropbox API Helper
 * Creates folders and generates shared links
 */

const DROPBOX_ACCESS_TOKEN = process.env.DROPBOX_ACCESS_TOKEN;
const BASE_FOLDER = '/PhotoRequests';

/**
 * Create a folder in Dropbox
 */
async function createFolder(folderName) {
  const folderPath = `${BASE_FOLDER}/${folderName}`;
  
  try {
    const response = await fetch('https://api.dropboxapi.com/2/files/create_folder_v2', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DROPBOX_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        path: folderPath,
        autorename: false,
      }),
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      // Check if folder already exists
      if (result.error && result.error['.tag'] === 'path' && 
          result.error.path['.tag'] === 'conflict') {
        console.log('Folder already exists, continuing...');
      } else {
        throw new Error(result.error_summary || 'Failed to create folder');
      }
    }
    
    return { success: true, path: folderPath };
  } catch (error) {
    console.error('Error creating Dropbox folder:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Create a shared link for a folder
 */
async function createSharedLink(folderPath) {
  try {
    // Try to create new shared link
    const response = await fetch('https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DROPBOX_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        path: folderPath,
        settings: {
          requested_visibility: 'public',
          audience: 'public',
          access: 'viewer',
        },
      }),
    });
    
    const result = await response.json();
    
    if (response.ok) {
      return { success: true, url: result.url };
    }
    
    // If link already exists, get existing link
    if (result.error && result.error['.tag'] === 'shared_link_already_exists') {
      return await getExistingSharedLink(folderPath);
    }
    
    throw new Error(result.error_summary || 'Failed to create shared link');
  } catch (error) {
    console.error('Error creating shared link:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get existing shared link for a path
 */
async function getExistingSharedLink(path) {
  try {
    const response = await fetch('https://api.dropboxapi.com/2/sharing/list_shared_links', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DROPBOX_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        path: path,
        direct_only: true,
      }),
    });
    
    const result = await response.json();
    
    if (result.links && result.links.length > 0) {
      return { success: true, url: result.links[0].url };
    }
    
    return { success: false, error: 'No shared link found' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Create folder and get shared link
 */
async function createFolderWithLink(folderName) {
  const folderPath = `${BASE_FOLDER}/${folderName}`;
  
  // Create folder
  const folderResult = await createFolder(folderName);
  if (!folderResult.success && !folderResult.path) {
    return { success: false, error: folderResult.error };
  }
  
  // Create shared link
  const linkResult = await createSharedLink(folderPath);
  if (!linkResult.success) {
    return { success: false, error: linkResult.error };
  }
  
  return {
    success: true,
    folderPath: folderPath,
    sharedLink: linkResult.url,
  };
}

/**
 * Delete a folder
 */
async function deleteFolder(folderName) {
  const folderPath = `${BASE_FOLDER}/${folderName}`;
  
  try {
    const response = await fetch('https://api.dropboxapi.com/2/files/delete_v2', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DROPBOX_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        path: folderPath,
      }),
    });
    
    if (response.ok) {
      return { success: true };
    }
    
    const result = await response.json();
    
    // Folder not found is okay
    if (result.error && result.error['.tag'] === 'path_lookup') {
      return { success: true, message: 'Folder not found' };
    }
    
    return { success: false, error: result.error_summary };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Convert shared link to direct download link
 */
function getDirectDownloadLink(sharedLink) {
  if (!sharedLink) return '';
  
  if (sharedLink.includes('?dl=0')) {
    return sharedLink.replace('?dl=0', '?dl=1');
  } else if (sharedLink.includes('&dl=0')) {
    return sharedLink.replace('&dl=0', '&dl=1');
  } else if (!sharedLink.includes('dl=1')) {
    return sharedLink + (sharedLink.includes('?') ? '&dl=1' : '?dl=1');
  }
  
  return sharedLink;
}

module.exports = {
  createFolder,
  createSharedLink,
  createFolderWithLink,
  deleteFolder,
  getDirectDownloadLink,
};

