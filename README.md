# HuntLog Tibia

Aplicativo para registrar suas hunts, acompanhar XP e lucro e compartilhar seus resultados. Para apoiar o projeto, use a aba **Apoie o projeto** no aplicativo.

## Baixar

### Windows 64 bits

[Baixar a versão 1.3.39 para Windows](https://github.com/jpcostadev/huntLog/raw/refs/heads/main/Instalador/HuntLog-Tibia-Setup-1.3.39-x64.exe) · [Versão mais recente](https://github.com/jpcostadev/huntLog/raw/refs/heads/main/Instalador/HuntLog-Tibia-Setup-latest.exe)

### Android

[Baixar a versão 1.3.35 para Android (APK)](https://media.githubusercontent.com/media/jpcostadev/huntLog/refs/heads/main/Instalador/HuntLog-Android-1.3.35.apk) · [Versão mais recente](https://media.githubusercontent.com/media/jpcostadev/huntLog/refs/heads/main/Instalador/HuntLog-Android-latest.apk)

Abra o instalador no dispositivo e siga as instruções. O aplicativo também verifica atualizações diretamente neste repositório.

> Os instaladores do Windows não possuem assinatura Authenticode; o Smart App Control pode exibir um bloqueio ao executar o instalador.

## Sincronização Firebase (opcional)

No Perfil, registre um app Web no projeto Firebase, cole o objeto `firebaseConfig`, crie o banco Cloud Firestore e ative o provedor E-mail/senha em Authentication. Publique no Firestore as regras que o próprio Perfil exibe. Crie a mesma conta no Perfil do desktop e do celular, e use **Sincronizar agora** nos dois. A configuração do projeto não é uma chave secreta; nunca use uma chave de conta de serviço no app.
