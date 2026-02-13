# Guía paso a paso: solucionar 404 en Vercel

El error **404 NOT_FOUND** en Vercel suele significar que Vercel no encuentra `index.html` en la raíz del proyecto. Sigue estos pasos en orden.

---

## Paso 1: Ver cómo está tu repositorio en Git

En GitHub (o GitLab/Bitbucket):

1. Abre tu repositorio.
2. Mira la **lista de archivos en la raíz** (la primera pantalla del repo).

**¿Qué ves en la raíz?**

- **Caso A:** Ves carpetas como `caja-app`, `Check`, u otras, y **no** ves `index.html` en la primera pantalla.  
  → Tu app está dentro de una subcarpeta (por ejemplo `caja-app`). Sigue el **Paso 2**.

- **Caso B:** Ves `index.html`, `app.js`, `styles.css`, `config.js`, etc. en la raíz.  
  → La raíz del repo ya es la app. Ve al **Paso 3** (revisar configuración en Vercel).

---

## Paso 2: Decirle a Vercel qué carpeta es la app (Root Directory)

Si tu app está en una subcarpeta (Caso A):

1. Entra en **[vercel.com](https://vercel.com)** e inicia sesión.
2. Abre el **proyecto** que da 404 (el que conectaste a este repo).
3. Arriba, pestaña **Settings**.
4. En el menú izquierdo, **General**.
5. Baja hasta la sección **Root Directory**.
6. Activa **Edit** (o "Override").
7. Escribe **exactamente** el nombre de la carpeta donde está la app:
   - Si la carpeta se llama `caja-app` → escribe: `caja-app`
   - Si se llama `Caja` → escribe: `Caja`
   - (Sin barra al final, sin espacios.)
8. Guarda (**Save**).
9. Vuelve a la pestaña **Deployments**, abre el menú (⋯) del último despliegue y elige **Redeploy** (o haz un nuevo commit y espera al deploy automático).

Prueba de nuevo la URL del proyecto. Debería cargar la app y no 404.

---

## Paso 3: Si la raíz del repo ya tiene index.html (Caso B)

Si en la raíz del repo ya ves `index.html` y aun así hay 404:

1. En Vercel → tu proyecto → **Settings** → **General**.
2. En **Root Directory** asegúrate de que esté **vacío** o desactivado (no debe apuntar a ninguna subcarpeta).
3. En **Build & Development Settings**:
   - **Framework Preset:** deja "Other" o "Vite" si no usas framework.
   - **Build Command:** déjalo vacío (no hace falta compilar).
   - **Output Directory:** vacío o `.`
   - **Install Command:** vacío.
4. Guarda y haz **Redeploy** del último deployment.

---

## Paso 4: Opción alternativa – Repo solo con la app

Si prefieres que la raíz del repo sea directamente la app (sin subcarpetas):

1. Crea un **repositorio nuevo** en GitHub (por ejemplo `caja-app`).
2. En tu PC, entra en la carpeta de la app:
   ```bash
   cd C:\Users\Lenovo\Proyectos\caja-app
   ```
3. Si aún no es un repo git:
   ```bash
   git init
   git add .
   git commit -m "App caja"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/caja-app.git
   git push -u origin main
   ```
   (Sustituye `TU_USUARIO` y `caja-app` por tu usuario y nombre del repo.)
4. En Vercel: **Add New…** → **Project** → Importa **ese** repositorio (solo caja-app).
5. **Root Directory** déjalo vacío.
6. Deploy. La URL debería servir la app sin 404.

---

## Resumen

| Situación | Qué hacer |
|-----------|-----------|
| Repo con carpeta `caja-app` (u otra) y dentro está index.html | Vercel → Settings → Root Directory → `caja-app` (o el nombre de esa carpeta) → Save → Redeploy |
| Repo con index.html en la raíz | Root Directory vacío; Build/Output vacíos; Redeploy |
| Sigue 404 | Crear un repo nuevo solo con el contenido de `caja-app` y conectar ese repo en Vercel (Paso 4) |

Si después de esto sigues viendo 404, dime exactamente qué ves en la raíz de tu repo (nombres de carpetas/archivos) y te indico el valor exacto para Root Directory.
