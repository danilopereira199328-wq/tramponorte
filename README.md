# 🚀 Trampo Norte

Uma plataforma de emprego full-stack para a região Norte de Portugal, que liga candidatos a empresas com um sistema completo de vagas, candidaturas, notificações em tempo real e chat.

🔗 **Projeto Online:** [https://tramponorte.onrender.com](https://tramponorte.onrender.com)

> ⏳ **Nota:** O projeto está alojado no plano gratuito do Render, que hiberna após 15 minutos de inatividade. O primeiro acesso pode demorar cerca de 30 segundos a acordar.

---

## 📸 Captura de Ecrã

*[Substitui esta linha por uma imagem do teu site. Para isso, tira um print, faz upload para o repositório do GitHub e usa o caminho aqui. Exemplo: `![Trampo Norte](screenshot.png)`]*

---

## 🛠️ Stack Tecnológica

**Backend**
- **Node.js** + **Express** — servidor e API REST
- **PostgreSQL** (via **Supabase**) — base de dados persistente
- **JWT** + **Bcrypt** — autenticação e hash de passwords
- **Socket.io** — notificações e chat em tempo real
- **Helmet** + **Express Rate Limit** — segurança
- **Multer** + **Cloudinary** — upload de ficheiros
- **Resend** — envio de emails

**Frontend**
- **HTML5**, **CSS3** e **JavaScript (Vanilla)** — sem frameworks, com foco na simplicidade
- **Chart.js** — gráficos no dashboard da empresa
- **Design responsivo** com **Modo Escuro** integrado

**Serviços Externos**
- **Supabase** — base de dados PostgreSQL gerida
- **Cloudinary** — armazenamento de CVs e avatares
- **Resend** — envio de emails transacionais
- **Render** — deploy automatizado a cada `git push`

---

## ✨ Funcionalidades

- **Candidatos:** Registo, login, perfil com skills, upload de CV e foto, candidatura a vagas, guardar vagas favoritas, avaliar empresas.
- **Empresas:** Registo, login, publicação e gestão de vagas, painel de candidaturas com estado (Pendente, Em Análise, Aceite, Rejeitado), envio de mensagens diretas aos candidatos.
- **Extras:** Notificações em tempo real (Socket.io), chat entre empresa e candidato, filtros de pesquisa (cidade, tipo, área, salário), paginação, modo escuro, match de skills e dashboard com gráficos.

---

## 🧠 Decisões Técnicas (o mais importante para entrevistas)

Estas são as decisões que mostram maturidade técnica. Explica-as na entrevista se te perguntarem sobre o projeto.

### Porque escolhi PostgreSQL (Supabase) em vez de SQLite?

Comecei com SQLite para testes locais, mas percebi que **não é adequado para ambientes serverless** como o Render. O plano gratuito do Render apaga o sistema de ficheiros quando o servidor hiberna, o que significa que a base de dados SQLite desaparecia. Migrei para o **PostgreSQL no Supabase** para garantir:
- **Persistência** dos dados entre reinícios
- **Integridade referencial** (chaves estrangeiras, constraints)
- **Acesso remoto** seguro através do Transaction Pooler (porta 6543)

### Porque usei o Cloudinary em vez de guardar ficheiros localmente?

Pela mesma razão: o Render apaga os ficheiros locais quando reinicia. O **Cloudinary** serve os CVs e avatares através de uma **CDN global**, o que também melhora o desempenho. A integração com `upload_stream` permite fazer upload de buffers em memória, sem gravar nada em disco.

### Porque escolhi JWT em vez de sessões?

O **JWT** é **stateless**: o servidor não precisa de guardar sessões em memória. Isto é ideal para uma API REST que pode escalar horizontalmente. O token é assinado com uma chave secreta (`JWT_SECRET`) e verificado em cada pedido.

### Porque usei Socket.io para o chat e notificações?

O Socket.io permite **comunicação bidirecional em tempo real**. Quando um candidato se candidata a uma vaga, a empresa recebe uma notificação instantânea, sem precisar de recarregar a página. O chat usa o mesmo mecanismo, com mensagens guardadas na base de dados para o histórico.

---

## 🚧 Desafios Ultrapassados

Estes foram os problemas reais que enfrentei e resolvi:

1. **Erro `ENOIDENTIFIER` no Supabase:** A string de conexão precisava de incluir o ID do projeto no nome de utilizador (`postgres.[PROJECT-REF]`) e a ligação tinha de ser feita via **Transaction Pooler** (porta 6543), porque o Render não suporta IPv6.
2. **Erro `Could not locate the bindings file` (SQLite no Windows):** Resolvido ao compilar o `sqlite3` com `node-gyp`, mas depois substituído pelo PostgreSQL.
3. **`postgres is not a function`:** A biblioteca `postgres` exporta a função de forma diferente da esperada. A solução foi usar `require('postgres')` diretamente, sem `.default`.
4. **PDFs bloqueados no Cloudinary (401):** O Cloudinary bloqueia PDFs por defeito. A solução foi ativar a opção **"Allow delivery of PDF and ZIP files"** nas definições de segurança.
5. **`applyJob is not defined`:** A função estava definida dentro de um âmbito local, mas era chamada por um `onclick` inline. A solução foi atribuí-la a `window.applyJob`.

---

## ⚙️ Como correr localmente

1. **Clona o repositório:**
   ```bash
   git clone https://github.com/danilopereira199328-wq/tramponorte.git
   cd tramponorte