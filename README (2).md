# 🚀 Trampo Norte

Uma plataforma de emprego full-stack para a região Norte de Portugal, que liga candidatos a empresas com um sistema completo de vagas, candidaturas, notificações em tempo real e chat.

🔗 **Projeto Online:** [https://tramponorte.onrender.com](https://tramponorte.onrender.com)

> ⏳ **Nota:** O projeto está alojado no plano gratuito do Render, que hiberna após 15 minutos de inatividade. O primeiro acesso pode demorar cerca de 30 segundos.

---

## 📸 Captura de Ecrã

*[Substitui esta linha por uma imagem do teu site. Para isso, tira um print, faz upload para o repositório do GitHub e usa o caminho aqui. Exemplo: `![![Trampo Norte](screenshot.png)`]*

---

## 🛠️ Stack Tecnológica

**Backend**
- **Node.js** + **Express** — servidor e API REST
- **PostgreSQL** (via **Supabase**) — base de dados persistente
- **JWT** + **Bcrypt** — autenticação e hash de passwords
- **Socket.io** — notificações e chat em tempo real
- **Helmet** + **Express Rate Limit** — segurança

**Frontend**
- **HTML5**, **CSS3** e **JavaScript (Vanilla)** — sem frameworks, com foco na simplicidade
- **Design responsivo** com **Modo Escuro** integrado

**Serviços Externos**
- **Cloudinary** — armazenamento de CVs e avatares
- **Resend** — envio de emails de notificação
- **Render** — deploy automatizado

---

## ✨ Funcionalidades

- **Candidatos:** Registo, login, perfil com skills, upload de CV e foto, candidatura a vagas, guardar vagas favoritas, avaliar empresas.
- **Empresas:** Registo, login, publicação e gestão de vagas, painel de candidaturas com estado (Pendente, Em Análise, Aceite, Rejeitado), envio de mensagens diretas aos candidatos.
- **Extras:** Notificações em tempo real (Socket.io), chat entre empresa e candidato, filtros de pesquisa (cidade, tipo, área, salário), paginação, modo escuro e match de skills.

---

## ⚙️ Como correr localmente

1. **Clona o repositório:**
   ```bash
   git clone https://github.com/danilopereira199328-wq/tramponorte.git
   cd tramponorte