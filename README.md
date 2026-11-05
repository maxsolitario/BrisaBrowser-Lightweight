# Brisa Browser

Navegador desktop experimental para Windows, com Chromium via Electron, nova aba personalizável, grupos de atalhos, bloqueio básico de anúncios e carregamento de extensões locais compatíveis. O design usa uma identidade escura e tranquila, com verde-lima, tipografia do sistema e poucos controles visuais.

## Requisitos

- Windows 10/11 x64
- Node.js 22 ou superior para desenvolvimento e build

## Desenvolvimento

```powershell
npm install
npm start
```

## Gerar os executáveis

```powershell
npm run dist
```

Os artefatos aparecem em `release/`: instalador NSIS (`Brisa-...-x64.exe`) e executável portátil (`Brisa-...-portable-x64.exe`). Para gerar apenas um formato, use `npm run dist:installer` ou `npm run dist:portable`.

O workflow `.github/workflows/release.yml` gera os dois arquivos no GitHub Actions. Depois de enviar o repositório, publique uma tag `v0.1.0`; o workflow cria uma GitHub Release com os `.exe` anexados. Também é possível iniciar uma compilação manual pela aba Actions; nesse caso o build fica disponível como artifact.

## Extensões e bloqueio

Na primeira versão, extensões são carregadas de uma pasta local já descompactada e seus caminhos ficam salvos para carregá-las na próxima abertura. Arquivos `.crx` e extensões diretamente da Chrome Web Store não são suportados. Electron implementa apenas parte das APIs de extensão do Chrome; compatibilidade varia. O bloqueio de anúncios é uma lista local inicial de domínios e pode ser ampliado.

## Limites conhecidos do MVP

- Cada aba cria um conteúdo Chromium separado; o consumo depende dos sites e do número de abas. Feche abas que não estiver usando em computadores com 8 GB.
- O pacote inclui o runtime Chromium, então o instalador tem centenas de MB; Electron prioriza compatibilidade com o engine atual e não gera um navegador minúsculo.
- O bloqueador inicial usa domínios conhecidos e ainda não substitui listas completas como EasyList/uBlock.
- Esta versão não inclui sincronização entre computadores, atualizações automáticas, importação de favoritos nem assinatura Authenticode.

## Estado do projeto

Este repositório contém um MVP em desenvolvimento. Antes de distribuição pública, valide a compatibilidade das extensões desejadas, revise regras de bloqueio e configure assinatura de código para reduzir avisos do Windows SmartScreen.
