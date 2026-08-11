@echo off
rem ------------------------------------------------------------
rem Gradle Wrapper script for Windows (generated)
rem ------------------------------------------------------------
setlocal enabledelayedexpansion
set APP_NAME=gradlew
set GRADLE_WRAPPER_JAR=gradle\wrapper\gradle-wrapper.jar

rem Find java executable
if defined JAVA_HOME (
    set "JAVA_EXE=%JAVA_HOME%\bin\java.exe"
) else (
    set "JAVA_EXE=java"
)

"%JAVA_EXE%" -classpath "%GRADLE_WRAPPER_JAR%" org.gradle.wrapper.GradleWrapperMain %*
endlocal