#!/usr/bin/env sh
# ------------------------------------------------------------
# Gradle Wrapper script (generated)
# ------------------------------------------------------------
# This script allows the project to be built without requiring a
# pre‑installed Gradle distribution. It delegates to the wrapper
# JAR located at gradle/wrapper/gradle-wrapper.jar.

APP_NAME="gradlew"
GRADLE_WRAPPER_JAR="gradle/wrapper/gradle-wrapper.jar"

# Determine Java executable
if [ -n "$JAVA_HOME" ]; then
    JAVA_EXE="$JAVA_HOME/bin/java"
else
    JAVA_EXE=java
fi

exec "$JAVA_EXE" -classpath "$GRADLE_WRAPPER_JAR" org.gradle.wrapper.GradleWrapperMain "$@"