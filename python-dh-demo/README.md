# Python DH Demo

Diese Version fasst die alte `dh-demo` nicht an. Sie nutzt nur die Python-Standardbibliothek.

## Start

Schnelle Demo-Version:

```powershell
cd .\python-dh-demo
python .\app.py
```

Fachlich sauberere Extended-Version mit getrennten Teilnehmern:

```powershell
cd .\python-dh-demo
python .\app_extended.py
```

Dann im Browser öffnen:

```text
http://127.0.0.1:3000
```

Hinweis: Immer nur eine der beiden Varianten gleichzeitig starten, da beide Port `3000` nutzen.

## Demo-Ablauf

1. Alice, Bob und Charlie anlegen.
2. Bei Alice `Ping` klicken, damit Alice Bob und Charlie kennt.
3. Für den normalen Ablauf bei Alice `Start DH` klicken.
4. Für den MITM-Angriff mindestens Alice und Bob anlegen, bei Alice `Ping` klicken, die Checkbox `Man-in-the-Middle` aktivieren und bei Alice `Start DH` klicken.

## Logs

Die Oberfläche zeigt die öffentlichen Nachrichten, die Partner-Ansicht und nach einem Angriff auch Mallorys interne Sicht.
Private Exponenten und berechnete Geheimnisse werden in den jeweiligen Ansichten und zusätzlich in der Kommandozeile ausgegeben.
