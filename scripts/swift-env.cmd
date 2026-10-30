@echo off
rem Runs %XC_CMD% inside the MSVC developer environment with the Swift toolchain on PATH.
rem Usage (PowerShell):  $env:XC_CMD = 'swift build'; cmd /c scripts\swift-env.cmd <working-dir>
setlocal
set "VCVARS=%ProgramFiles(x86)%\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
if not exist "%VCVARS%" set "VCVARS=%ProgramFiles%\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat"
set "PATH=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer;%PATH%"
call "%VCVARS%" >nul 2>&1
for /d %%T in ("%LOCALAPPDATA%\Programs\Swift\Toolchains\*") do set "SWIFTBIN=%%~T\usr\bin"
for /d %%P in ("%LOCALAPPDATA%\Programs\Swift\Platforms\*") do set "SDKROOT=%%~P\Windows.platform\Developer\SDKs\Windows.sdk"
for /d %%R in ("%LOCALAPPDATA%\Programs\Swift\Runtimes\*") do set "SWIFTRT=%%~R\usr\bin"
set "PATH=%SWIFTBIN%;%SWIFTRT%;%PATH%"
cd /d "%~1"
%XC_CMD%
exit /b %ERRORLEVEL%
