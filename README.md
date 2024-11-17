## THIS IS NOT WORKED ON AND NOT ON THE STORE ANYMORE SINCE GOOGLE RELEASE THEIR *ASK* FEATURE

<div align="center"
  <img src="./textframe.svg" alt="Project Logo" width="200"/>
</div>

# Textframe

This monorepo contains a Python FASTAPI backend and a Chrome Extension frontend that work together to find specific moments in YouTube videos based on spoken content (transcript).

## 📂 Project Structure

This repository consists of two main components:

- [Textframe API](./textframe-api/README.md) - Backend REST API service
- [Textframe Extension](./textframe-extension/README.md) - Frontend browser extension

## 🚀 Quick Start
### Setup

1. Clone the repository:
```bash
git clone https://github.com/aumb/textframe.git
cd textframe
```

2. Set up the textframe API:
```bash
cd textframe-api
pip install -r requirements.txt
```

3. Set up the textframe Extension:
```bash
cd ../textframe-extension
npm install
```

## 🔗 Component Documentation

- [Textframe API Documentation](./textframe-api/README.md)
- [Textframe Extension Documentation](./textframe-extension/README.md)

## 🏗️ Architecture

```
textframe/
├── textframe-api/      # Backend service
│   ├── app/            # Source code
│   └── requirements.txt
└── textframe-extension/    # Frontend extension
    ├── src/             # Source code
    └── manifest.json
```

### Building for Production

```bash
# Build API
cd textframe-api
docker build -t textframe-api .
docker run -d -p 80:80 textframe-api

# Build Extension
cd textframe-extension
npm run pack
```

## 📄 License

This project is licensed under the Creative Commons Attribution-NonCommercial 4.0 International License - see the [LICENSE](./LICENSE) file for details.

This means you can:
- ✅ Use the code for personal projects
- ✅ Modify and distribute the code
- ✅ Use it for educational purposes
- ❌ Use it for commercial purposes
- ❌ Monetize it directly or indirectly

If you'd like to use this project for commercial purposes, please contact the maintainers for a different licensing arrangement.

## 👥 Maintainers

- [@aumb](https://github.com/aumb)