# Use the latest Debian image
FROM debian:latest

# Install OpenSSH server and update packages
RUN apt-get update && \
    apt-get install -y openssh-server && \
    apt-get clean

# Create the directory for the SSH daemon to run
RUN mkdir /var/run/sshd

# Set a root password (change 'password123' to your secure password)
RUN echo 'root:password123' | chpasswd

# Allow root login with password by modifying sshd_config
RUN sed -i 's/^#\?PermitRootLogin .*/PermitRootLogin yes/' /etc/ssh/sshd_config

# (Optional) Disable PAM to avoid related issues
RUN sed -i 's/UsePAM yes/UsePAM no/g' /etc/ssh/sshd_config

# Expose SSH port
EXPOSE 22

# Start the SSH service in the foreground
CMD ["/usr/sbin/sshd", "-D"]
