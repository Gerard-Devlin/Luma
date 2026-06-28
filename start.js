#!/usr/bin/env node

/* eslint-disable no-console,@typescript-eslint/no-var-requires */
const path = require('path');

// Generate manifest.json before starting the standalone server.
function generateManifest() {
  console.log('Generating manifest.json for Docker deployment...');

  try {
    const generateManifestScript = path.join(
      __dirname,
      'scripts',
      'generate-manifest.js'
    );
    require(generateManifestScript);
  } catch (error) {
    console.error('Error calling generate-manifest.js:', error);
    throw error;
  }
}

generateManifest();

// Start the Next.js standalone server in this process.
require('./server.js');
