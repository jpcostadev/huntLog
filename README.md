# HuntLog Tibia

Aplicativo para registrar hunts do Tibia, acompanhar lucro e experiência, comparar sessões e compartilhar cards detalhados. O projeto usa React Native com Expo no Android e Electron no desktop Windows.

## Instalar no Windows

Baixe o instalador atualizado na pasta [Instalador](Instalador/README.md) ou clique diretamente:

[**Baixar HuntLog Tibia para Windows (64 bits)**](https://github.com/jpcostadev/huntLog/raw/refs/heads/main/Instalador/HuntLog-Tibia-Setup-latest.exe)

Depois de baixar, abra o arquivo `.exe` e siga as etapas do instalador.

Para instalar no Android, baixe o [APK mais recente](https://github.com/jpcostadev/huntLog/raw/refs/heads/main/Instalador/HuntLog-Android-latest.apk) e abra o arquivo no celular.

## Recursos

- Registro, edição, consulta e remoção de hunts.
- Perfil de personagem principal com nome, vocação e level sugeridos nos novos registros.
- Importação do texto `Session data` copiado do cliente do Tibia, incluindo horários, XP, loot, supplies, balance, dano, cura, monstros e itens.
- Abas para Minhas Hunts, Desempenho, Relatórios, Calculadora, Compartilhar e Perfil.
- Exportação do relatório filtrado em Excel (`.xlsx`), com abas de resumo, hunts, monstros e itens, no Android e no desktop.
- A aba Calculadora permite informar qualquer lote de TC (1, 50, 250 ou quantidades fracionadas), a cotação em GP no Tibia e quanto você paga e recebe em reais.
- A calculadora mostra GP por TC, custo de compra, receita de venda e margem em reais; também converte o lucro das hunts para TC e reais pela sua cotação de venda.
- As taxas de compra, venda e GP/TC ficam salvas no aparelho e aparecem na exportação Excel.
- Valores grandes na interface aparecem abreviados em `k`, `M`, `B`, `T`, `Q`, `E` e unidades maiores; os campos e a exportação Excel mantêm os números completos.
- Busca, filtros por período/data e ordenação por lucro, XP e XP por hora.
- Comparação de desempenho com destaques da melhor e da pior sessão e média do filtro atual.
- Card PNG de compartilhamento com os detalhes importados e crédito a Fallz Developer.
- Interface adaptada para celular e desktop.

## Requisitos

- Node.js compatível com Expo SDK 58.
- npm (o repositório usa `package-lock.json`).
- Para builds Android na nuvem: uma conta Expo e acesso ao EAS Build.
- Para gerar o instalador desktop: Windows x64.

## Instalação das dependências

```bash
npm install
```

## Desenvolvimento mobile

Inicie o servidor Expo:

```bash
npx expo start
```

Use o Expo Go para telas que não dependam de módulos nativos adicionais. Para testar recursos nativos como SQLite, gere/instale um development build ou APK.

## Gerar APK Android

O perfil `preview` do EAS gera um APK para instalação direta. Faça login na conta Expo quando solicitado:

```bash
npx eas-cli build --platform android --profile preview
```

O link do APK e o andamento ficam disponíveis na página do build no Expo. O perfil `production` gera um Android App Bundle:

```bash
npx eas-cli build --platform android --profile production
```

## Desenvolvimento desktop

Inicie o export web de desenvolvimento e o Electron:

```bash
npm run desktop:dev
```

## Gerar instalador desktop Windows

Em Windows x64, gere o instalador NSIS:

```bash
npm run desktop:release
```

O instalador aparece em:

```text
out/desktop/HuntLog-Tibia-Setup-1.0.7-x64.exe
```

O instalador atual não é assinado com certificado de código; o Windows pode mostrar o aviso de publicador desconhecido.

## Verificações

```bash
npx expo lint
npx tsc --noEmit
```

## Armazenamento

No Android, os dados locais são armazenados em SQLite. No desktop, são mantidos no armazenamento local do aplicativo. Os dados não sincronizam automaticamente entre dispositivos.
