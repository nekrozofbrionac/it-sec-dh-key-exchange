# Python DH Demo

Diese Version fasst die alte `dh-demo` nicht an. Sie nutzt nur die Python-Standardbibliothek.

## Start

```powershell
cd .\python-dh-demo
python .\app.py
```

Dann im Browser öffnen:

```text
http://127.0.0.1:3000
```

## Demo-Ablauf

1. Alice, Bob und Charlie anlegen.
2. Bei Alice `Ping` klicken, damit Alice Bob und Charlie kennt.
3. Bei Alice `Start DH` klicken.
4. Für den MITM-Angriff mindestens Alice und Bob anlegen und `Start MITM` klicken.

## Logs

Die Oberfläche zeigt nur die öffentlichen Nachrichten und die Partner-Ansicht.
Private Exponenten, berechnete Geheimnisse und MITM-Details werden absichtlich nur in der Kommandozeile ausgegeben.
