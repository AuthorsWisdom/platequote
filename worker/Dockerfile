FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    QT_QPA_PLATFORM=offscreen \
    HOME=/tmp \
    PRUSA_SLICER_BIN=/opt/prusaslicer/AppRun \
    PORT=8080

# PrusaSlicer 2.8.1 is the last release line that published a Linux AppImage.
# Newer releases are Flatpak-only. The binary is downloaded at image build
# time and executed as a separate process (AGPL-3.0; not linked).
ARG PRUSA_URL=https://github.com/prusa3d/PrusaSlicer/releases/download/version_2.8.1/PrusaSlicer-2.8.1+linux-x64-newer-distros-GTK3-202409181416.AppImage

RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 \
        python3-pip \
        python3-venv \
        ca-certificates \
        curl \
        libwebkit2gtk-4.1-0 \
        libgtk-3-0t64 \
        libgl1 \
        libglu1-mesa \
        libegl1 \
    && rm -rf /var/lib/apt/lists/* \
    && curl -fsSL -o /tmp/prusa.AppImage "$PRUSA_URL" \
    && chmod +x /tmp/prusa.AppImage \
    && cd /opt && /tmp/prusa.AppImage --appimage-extract \
    && mv /opt/squashfs-root /opt/prusaslicer \
    && rm /tmp/prusa.AppImage \
    && ln -s /opt/prusaslicer/AppRun /usr/local/bin/prusa-slicer

RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:${PATH}"

WORKDIR /app
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY gcode_parse.py mesh_analysis.py slice_job.py server.py /app/

EXPOSE 8080
CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT:-8080}"]
