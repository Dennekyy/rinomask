# Declaração de Autoria e Propriedade — RinoMask

- **Software:** RinoMask — navegador antidetect desktop (gerenciamento de múltiplas contas).
- **Titular / Autor:** **Dennekyy** (https://github.com/Dennekyy)
- **Contato:** via perfil no GitHub (https://github.com/Dennekyy)
- **Data desta declaração:** 2026-06-13
- **Natureza:** Programa de computador concebido, especificado e dirigido pelo titular,
  desenvolvido com assistência de ferramenta de IA sob suas instruções. A titularidade
  dos direitos patrimoniais é do titular acima.

> Por privacidade, o repositório público usa o identificador **Dennekyy**. Para registros
> formais (INPI, OpenTimestamps, cartório) use o seu **nome civil completo** — isso fortalece
> a prova de titularidade sem precisar expor o nome no repositório público.

## 1. Impressão digital do código (integridade)
O arquivo **`MANIFEST.sha256`** contém o hash **SHA-256** de cada arquivo de origem e um
**hash-raiz** (resumo de todos eles). Qualquer alteração no código muda esse hash-raiz —
ele identifica esta versão exata do programa de forma única e verificável.

Para (re)gerar a impressão digital:
```
npm run manifest
```

## 2. Como PROVAR que era seu numa determinada data
A proteção por direito autoral nasce **automaticamente** com a criação da obra (Lei
9.610/98 e Lei do Software 9.609/98, no Brasil). Para ter **prova com data** caso precise:

1. **Carimbo de tempo imutável (grátis, recomendado) — OpenTimestamps**
   - Anexa o hash do `MANIFEST.sha256` à blockchain do Bitcoin (prova independente de data).
   - `npm i -g opentimestamps-cli` e depois `ots stamp MANIFEST.sha256`
   - Guarde o `MANIFEST.sha256.ots` gerado. Para verificar: `ots verify MANIFEST.sha256.ots`.

2. **Registro formal no INPI (Brasil) — Registro de Programa de Computador (RPC)**
   - É o registro oficial de software. Gera certificado com data e titular.
   - Envia-se um resumo/hash do código (o `MANIFEST.sha256` serve a esse propósito).
   - Site: gov.br/inpi → "Programa de Computador".

3. **Repositório versionado (GitHub)**
   - `git init` + commits dão histórico datado por um terceiro confiável (data de cada commit).
   - Este projeto está em https://github.com/Dennekyy/rinomask sob esta licença proprietária:
     o código fica visível, mas a cópia/uso/derivação sem autorização é proibida.

4. **Cópia datada por e-mail/cartório**
   - Envie o `MANIFEST.sha256` (e/ou o `.zip` do código) para você mesmo por e-mail
     com data, ou registre em cartório de títulos e documentos.

## 3. Onde a autoria está embutida no produto
- `LICENSE` (copyright e termos), este `AUTHORSHIP.md`.
- `package.json` → campos `author` e `build.copyright` (este último é gravado nas
  propriedades do `RinoMask.exe`, visíveis em Propriedades → Detalhes do arquivo).
- Logo/marca própria (rinoceronte) no app e no ícone.
