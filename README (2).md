# 🚀 Trampo Norte

Uma plataforma de emprego moderna, segura e completa desenvolvida especificamente para a região Norte de Portugal[cite: 6]. O projeto foca-se em proporcionar uma experiência fluída tanto para candidatos como para empresas, integrando tecnologias web modernas e comunicação em tempo real.

## 🔗 Link do Projeto Online
👉 **[Acede ao Trampo Norte Aqui](https://tramponorte.onrender.com)**[cite: 6]

## 💻 Tecnologias Utilizadas

**Frontend:**
- HTML5, CSS3 e JavaScript (Vanilla)[cite: 6]
- Design Responsivo e Modo Escuro (Dark Mode) nativo[cite: 6]
- Socket.io (para notificações em tempo real)[cite: 6]

**Backend & Base de Dados:**
- Node.js e Express[cite: 6]
- PostgreSQL (com suporte a alojamento em nuvem via Supabase)[cite: 1, 6]
- JWT (JSON Web Tokens) para Autenticação segura[cite: 6]
- Bcrypt (Hash de palavras-passe)[cite: 6]
- Multer & Cloudinary (Upload e gestão segura de currículos em formato PDF)[cite: 6, 8]
- Helmet e Express-Rate-Limit (Proteção contra ataques de força bruta e segurança web)[cite: 6]
- Nodemailer (Gestão e envio de emails, incluindo recuperação de palavra-passe)[cite: 3, 6]

## ⚙️ Principais Funcionalidades

- **Candidatos:** 
  - Registo e Login seguros[cite: 6].
  - Gestão de perfil com indicação de competências (*Skills*) e cidade[cite: 6].
  - Upload de currículo estritamente em formato PDF (com validação de tipo MIME e limite de tamanho)[cite: 8].
  - Candidatura a vagas, salvamento de oportunidades favoritas e sistema de avaliações de empresas[cite: 6, 8, 9].
- **Empresas:** 
  - Registo e Login[cite: 6].
  - Publicação, gestão e arquivo de vagas de emprego[cite: 3, 6].
  - Dashboard interativo para gestão de candidaturas recebidas (atualização de estados: Pendente, Em Análise, Aceite, Rejeitado)[cite: 6].
- **Extras:** 
  - Alertas em tempo real via WebSockets (Socket.io) para avisar as empresas de novas candidaturas[cite: 6, 8].
  - Sistema de recuperação de palavra-passe por token encriptado[cite: 8, 10].
  - Filtros avançados de pesquisa e paginação[cite: 6].

## 🛠️ Como correr o projeto localmente

1. Clona o repositório ou abre a pasta do projeto.
2. Instala as dependências:
   ```bash
   npm install