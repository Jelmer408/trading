FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . ./bot/

# Make entrypoint executable
RUN chmod +x ./bot/entrypoint.sh

CMD ["./bot/entrypoint.sh"]
