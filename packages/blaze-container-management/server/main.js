import { Meteor } from 'meteor/meteor';
import Docker from 'dockerode';
import path from 'path';

const docker = new Docker();
const fs = require('fs');
const os = require('os');

Meteor.methods({
   createContainer: async function() {
        try {
            const imageName = 'debian-ssh-server';
            let image;
            
            try {
                // Check if image exists
                image = docker.getImage(imageName);
                await image.inspect();
                console.log(' Image already exists');
            } catch(error) {
                // Image doesn't exist, build it
                console.log(" Building Docker image...");
                
                const projectRoot = process.cwd().split('.meteor')[0];
                const dockerfileDir = path.join(projectRoot, 'packages', 'blaze-container-management', 'server');
                
                console.log(' Looking for Dockerfile at:', dockerfileDir);
                
                const stream = await docker.buildImage({
                    context: dockerfileDir,
                    src: ['Dockerfile']
                }, {
                    t: imageName
                });
                
                // Wait for build to complete
                await new Promise((resolve, reject) => {
                    docker.modem.followProgress(stream, (err, res) => {
                        if (err) {
                            console.error(' Build failed:', err);
                            reject(err);
                        } else {
                            console.log(' Image build complete');
                            resolve(res);
                        }
                    });
                });
            }

            // Create container (works for both existing and newly built images)
            console.log(' Creating container...');
            const containerName = `ssh-container-${Date.now()}`;
            
            const container = await docker.createContainer({
                Image: imageName,
                name: containerName,
                ExposedPorts: {
                    '22/tcp': {}
                },
                HostConfig: {
                    PortBindings: {
                        '22/tcp': [{ HostPort: '0' }]
                    }
                }
            });

            console.log(' Starting container...');
            await container.start();
            console.log(` Container ${containerName} started successfully`);

            // Get container info
            const containerInfo = await container.inspect();
            const assignedPort = containerInfo.NetworkSettings.Ports['22/tcp'][0].HostPort;
            
            console.log(` SSH available on localhost:${assignedPort}`);
            console.log(` Username: root`);
            console.log(` Password: changeme`);

            return {
                success: true,
                containerId: container.id,
                containerName: containerName,
                sshPort: assignedPort,
                message: `Container created successfully! SSH available on localhost:${assignedPort}`
            };

        } catch(error) {
            console.error(' Error in createContainer:', error);
            throw new Meteor.Error('container-creation-failed', error.message);
        }
   },

   listContainers: async function() {
        try {
            const containers = await docker.listContainers({ all: true });
            
            // Format containers for the UI
            const formattedContainers = containers.map(container => {
                const sshPort = container.Ports.find(port => port.PrivatePort === 22);
                
                return {
                    id: container.Id,
                    containerId: container.Id,
                    name: container.Names[0].replace('/', ''), // Remove leading slash
                    truncatedId: container.Id.substring(0, 12),
                    image: container.Image,
                    status: container.State,
                    statusClass: container.State === 'running' ? 'running' : 'stopped',
                    publicPort: sshPort ? sshPort.PublicPort : 'N/A',
                    created: new Date(container.Created * 1000).toLocaleString(),
                    isFavorite: false
                };
            });
            
            return formattedContainers;
        } catch(error) {
            console.error(' Error listing containers:', error);
            throw new Meteor.Error('list-containers-failed', error.message);
        }
   },

   stopContainer: async function(containerId) {
        try {
        console.log(` Closing container: ${containerId}`);
        const container = docker.getContainer(containerId);
        try {
            await container.stop();
            console.log(` Container ${containerId} stopped`);
        } catch(stopError) {
            // Container might already be stopped, that's okay
            console.log(` Container might already be stopped: ${stopError.message}`);
        }
        await container.remove();
        console.log(` Container ${containerId} deleted successfully`);
        
        return {
            success: true,
            message: 'Container closed and deleted successfully'
        };
        
        } catch(error) {
        console.error(' Error closing container:', error);
        throw new Meteor.Error('close-container-failed', error.message);
        }
               

                   
    },
   
    buildImageFromDockerfile: async function(dockerfileContent, fileName) {
    try {
      console.log(` Building image from imported Dockerfile: ${fileName}`);
      
      // Create a temporary directory for the build
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dockerfile-import-'));
      const dockerfilePath = path.join(tempDir, 'Dockerfile');
      
      // Write the Dockerfile content to temp directory
      fs.writeFileSync(dockerfilePath, dockerfileContent);
      
      // Generate a unique image name
      const timestamp = Date.now();
      const imageName = `imported-image-${timestamp}`;
      
      console.log(` Temp directory: ${tempDir}`);
      console.log(` Image name: ${imageName}`);
      
      // Build the image
      const stream = await docker.buildImage({
        context: tempDir,
        src: ['Dockerfile']
      }, {
        t: imageName
      });
      
      // Wait for build to complete
      await new Promise((resolve, reject) => {
        docker.modem.followProgress(stream, 
          (progress) => {
            if (progress.stream) {
              const message = progress.stream.trim();
              if (message && (
                message.includes('Step ') || 
                message.includes('Successfully built') ||
                message.includes('Successfully tagged'))) {
                console.log('', message);
              }
            }
            if (progress.error) {
              console.error(' BUILD ERROR:', progress.error);
            }
          },
          (err, res) => {
            if (err) {
              console.error(' Build failed:', err);
              reject(err);
            } else {
              console.log(' Image build complete');
              resolve(res);
            }
          }
        );
      });
      
      // Clean up temp directory
      fs.rmSync(tempDir, { recursive: true, force: true });
      
      return {
        success: true,
        imageName: imageName,
        originalFileName: fileName,
        message: `Image built successfully from ${fileName}`
      };
      
    } catch(error) {
      console.error(' Error building image from Dockerfile:', error);
      throw new Meteor.Error('dockerfile-import-failed', error.message);
    }
  }



})