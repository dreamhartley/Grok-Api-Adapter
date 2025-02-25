@echo off
echo Checking project status...

IF NOT EXIST "node_modules\" (
    echo First time running - Installing dependencies...
    call npm install
    IF %ERRORLEVEL% NEQ 0 (
        echo Error: npm install failed
        pause
        exit /b 1
    )
    echo Dependencies installed successfully.
) ELSE (
    echo Dependencies already installed.
)

echo Starting application...
node index.js

IF %ERRORLEVEL% NEQ 0 (
    echo Error: Application failed to start
    pause
    exit /b 1
)

pause