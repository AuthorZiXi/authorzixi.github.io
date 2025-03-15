@echo off
del /f /s /q .\dist
xcopy /e /c /q /y ..\blogs\dist .\dist