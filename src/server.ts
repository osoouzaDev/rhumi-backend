import app from "./app.js"

const PORT = 8000;

app.listen(PORT, () => {
    console.log('RHumi API rodando em https://localhost:${PORT}');
});