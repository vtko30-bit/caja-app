# Pasos 1 a 1: Crear el repositorio en Git y subir la app

Sigue estos pasos en orden. Si no tienes Git instalado, instálalo primero desde https://git-scm.com/download/win

---

## Parte A: Crear el repositorio en GitHub

1. Abre el navegador y entra en **https://github.com**
2. Inicia sesión (o crea una cuenta si no tienes).
3. Arriba a la derecha, haz clic en el **+** y elige **New repository**.
4. En **Repository name** escribe: `caja-app` (o el nombre que quieras).
5. Deja **Public** seleccionado.
6. **No** marques "Add a README file" (deja la caja vacía).
7. Haz clic en **Create repository**.
8. En la pantalla siguiente verás una URL como:  
   `https://github.com/TU_USUARIO/caja-app.git`  
   Déjala abierta o cópiala; la usarás más abajo.

---

## Parte B: Abrir la terminal en la carpeta de la app

9. En Windows, abre **PowerShell** o **Símbolo del sistema**:
   - Tecla Windows, escribe `PowerShell` y ábrelo,  
   - o en el Explorador de archivos ve a la carpeta `caja-app`, haz clic en la barra de ruta, escribe `cmd` y Enter.
10. Ve a la carpeta de la app. Escribe y ejecuta (Enter después de cada línea):

    ```bash
    cd C:\Users\Lenovo\Proyectos\caja-app
    ```

    (Si ya estás en esa carpeta, no hace falta.)

---

## Parte C: Inicializar Git y hacer el primer commit

11. Comprueba si ya hay Git en la carpeta. Ejecuta:

    ```bash
    git status
    ```

    - Si dice **"not a git repository"** → sigue al paso 12.  
    - Si muestra archivos o "nothing to commit" → puedes seguir al paso 13 (o 14 si ya hiciste commit antes).

12. Inicializa el repositorio:

    ```bash
    git init
    ```

13. Añade todos los archivos:

    ```bash
    git add .
    ```

14. Crea el primer commit:

    ```bash
    git commit -m "App caja - primera subida"
    ```

15. Ponle nombre a la rama principal (si Git te lo pide):

    ```bash
    git branch -M main
    ```

---

## Parte D: Conectar con GitHub y subir

16. Conecta tu carpeta con el repo de GitHub. Sustituye **TU_USUARIO** por tu usuario de GitHub y **caja-app** por el nombre del repo si lo cambiaste:

    ```bash
    git remote add origin https://github.com/TU_USUARIO/caja-app.git
    ```

    Ejemplo: si tu usuario es `juanperez`, sería:
    `git remote add origin https://github.com/juanperez/caja-app.git`

17. Sube el código a GitHub:

    ```bash
    git push -u origin main
    ```

18. Si te pide **usuario y contraseña**:
    - Usuario: tu usuario de GitHub.
    - Contraseña: ya no se usa la contraseña normal. Necesitas un **Personal Access Token**:
      - GitHub → Settings → Developer settings → Personal access tokens → Generate new token.
      - Marca al menos `repo`.
      - Copia el token y úsalo como "contraseña" cuando Git te la pida.

---

## Parte E: Comprobar

19. Refresca la página de tu repo en GitHub (https://github.com/TU_USUARIO/caja-app).
20. Deberías ver: `index.html`, `app.js`, `styles.css`, `config.js`, carpeta `supabase`, etc.

Si ves esos archivos en la raíz del repo, ya está listo para conectar el proyecto en Vercel (sin poner subcarpeta en Root Directory).
