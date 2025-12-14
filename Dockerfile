# Use Puppeteer image which includes Node.js, npm, Puppeteer, and Chrome
FROM continuumio/miniconda3:latest
RUN conda install -y python=3.11.5

# Define home directory variable
ARG HOME_DIR=/root
ENV HOME_DIR=${HOME_DIR}

# USER root
# RUN apt-get update && apt-get install -y sudo

# # Give pptruser sudo access (pptruser already exists in Puppeteer image)
# RUN usermod -aG sudo pptruser && \
#     echo "pptruser ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers.d/pptruser

# USER pptruser
# Install Python 3.11 and required tools
# The Puppeteer image is based on Debian, so we can use apt-get
RUN apt-get update && apt-get install -y --no-install-recommends \
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
    libxss1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    fonts-liberation \
    libappindicator3-1 \
    lsb-release \
    libu2f-udev \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get update \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Create symlinks for python and pip to use Python 3.11
# RUN sudo update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.11 1 && \
#     sudo update-alternatives --install /usr/bin/python python /usr/bin/python3.11 1

# * venvs
WORKDIR ${HOME_DIR}/venv
RUN python3 -m venv fidex && \
    python3 -m venv pywb 
   
#* fidex related logic 
WORKDIR ${HOME_DIR}/fidex

# Copy requirements.txt first for better Docker layer caching
COPY requirements.txt .

# Create Python virtual environment for fidex and install dependencies
RUN ${HOME_DIR}/venv/fidex/bin/pip install --upgrade pip && \
    ${HOME_DIR}/venv/fidex/bin/pip install --no-cache-dir -r requirements.txt

# Copy package.json and package-lock.json (if exists)
COPY package.json ./

# Install Node.js dependencies
RUN npm install
# Use puppeteer from image instead of local installation
# RUN npm uninstall puppeteer

# Copy the rest of the application
COPY fidex/ .
ENV PYTHONPATH="${HOME_DIR}:${PYTHONPATH}"

WORKDIR ${HOME_DIR}

#* pywb related logic 
# Clone pywb repository
RUN git clone https://github.com/JingyZhu/pywb.git
RUN cd pywb && git checkout base-fix


WORKDIR ${HOME_DIR}/pywb
# Create Python virtual environment for pywb and install dependencies
RUN ${HOME_DIR}/venv/pywb/bin/pip install --upgrade pip && \
    ${HOME_DIR}/venv/pywb/bin/pip install --no-cache-dir -r requirements.txt && \
    ${HOME_DIR}/venv/pywb/bin/pip install esprima && \
    ${HOME_DIR}/venv/pywb/bin/pip install . && \
    ${HOME_DIR}/venv/pywb/bin/wb-manager init test
# Create fidelity-files directory structure
RUN mkdir -p ${HOME_DIR}/fidelity-files/writes && \
    mkdir -p ${HOME_DIR}/fidelity-files/warcs
# Initialize wb-manager in fidelity-files directory using pywb venv
RUN cd ${HOME_DIR}/fidelity-files && \
    ${HOME_DIR}/venv/pywb/bin/wb-manager init test

RUN mkdir -p ${HOME_DIR}/chrome_data


WORKDIR ${HOME_DIR}/docker-only
COPY docker-only/ .
RUN cp config.json ${HOME_DIR}/config.json
ENV FIDEX_CONFIG=${HOME_DIR}/config.json
RUN cp config.yaml ${HOME_DIR}/fidelity-files/config.yaml
RUN tar -xJf chrome_data.tar.xz -C ${HOME_DIR}/chrome_data
# COPY --chown=pptruser:pptruser measurement ${HOME_DIR}/measurement

WORKDIR ${HOME_DIR}
COPY docker-entrypoint.sh .
RUN chmod +x docker-entrypoint.sh

# Set entrypoint (using shell form to allow variable expansion)
ENTRYPOINT ["/root/docker-entrypoint.sh"]

# Default command - run bash
CMD ["/bin/bash"]