import app from "./app.js"

const PORT = 8000;

app.listen(PORT, () => {
    console.log('Servidor rodando em https://localhost:${PORT}');
});