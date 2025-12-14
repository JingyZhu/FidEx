# Use Puppeteer image which includes Node.js, npm, Puppeteer, and Chrome
FROM ghcr.io/puppeteer/puppeteer:23.1.1

# Define home directory variable
ARG HOME_DIR=/home/pptruser
ENV HOME_DIR=${HOME_DIR}

USER root
RUN apt-get update && apt-get install -y sudo

# Give pptruser sudo access (pptruser already exists in Puppeteer image)
RUN usermod -aG sudo pptruser && \
    echo "pptruser ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers.d/pptruser

USER pptruser
# Install Python 3.11 and required tools
# The Puppeteer image is based on Debian, so we can use apt-get
RUN sudo apt-get install -y --no-install-recommends \
    python3.11 \
    python3.11-dev \
    python3.11-venv \
    python3-pip \
    curl \
    git \
    unzip \
    tightvncserver \
    xfce4\
    xfce4-goodies \
    dbus-x11 \
    xfonts-base \
    vim \
    htop \
    net-tools \
    && sudo apt-get clean \
    && sudo rm -rf /var/lib/apt/lists/*

# Create symlinks for python and pip to use Python 3.11
RUN sudo update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.11 1 && \
    sudo update-alternatives --install /usr/bin/python python /usr/bin/python3.11 1

WORKDIR ${HOME_DIR}/fidex

#* fidex related logic 
# Create Python virtual environment for fidex and install dependencies
RUN python3 -m venv env_fidex && \
    ./env_fidex/bin/pip install --upgrade pip && \
    ./env_fidex/bin/pip install --no-cache-dir -r requirements.txt

# Copy package.json and package-lock.json (if exists)
COPY package.json ./

# Install Node.js dependencies
RUN npm install
# Use puppeteer from image instead of local installation
RUN npm uninstall puppeteer

# Copy requirements.txt first for better Docker layer caching
COPY requirements.txt .

# Copy the rest of the application
COPY . .

#* pywb related logic 
# Clone pywb repository
RUN git clone https://github.com/JingyZhu/pywb.git

# Create Python virtual environment for pywb and install dependencies
RUN cd pywb && \
    python3 -m venv env_pywb && \
    ./env_pywb/bin/pip install --upgrade pip && \
    ./env_pywb/bin/pip install --no-cache-dir -r requirements.txt && \
    ./env_pywb/bin/pip install .

# Create fidelity-files directory structure
RUN mkdir -p ${HOME_DIR}/fidelity-files/writes && \
    mkdir -p ${HOME_DIR}/fidelity-files/warcs

# Initialize wb-manager in fidelity-files directory using pywb venv
RUN cd ${HOME_DIR}/fidelity-files && \
    ${HOME_DIR}/pywb/env_pywb/bin/wb-manager init test


COPY docker-only/config.json ${HOME_DIR}/fidex/config.json
COPY docker-only/config.yaml ${HOME_DIR}/fidelity-files/config.yaml
RUN tar -xJf docker-only/chrome_data.tar.xz -C ${HOME_DIR}/chrome_data

RUN chmod +x ${HOME_DIR}/fidex/docker-entrypoint.sh && \
    chmod +x ${HOME_DIR}/fidex/start-vnc.sh

# Fix ownership of all copied files (COPY runs as root, so files need to be chowned)
RUN sudo chown -R pptruser:pptruser ${HOME_DIR}

# Set entrypoint (using shell form to allow variable expansion)
ENTRYPOINT ${HOME_DIR}/fidex/docker-entrypoint.sh

# Default command - run bash
CMD ["/bin/bash"]