# Instalar ApliArte Directo en un VPS de Hostinger

> **Aún no listo para uso público.** Este instalador es una preparación: el repositorio no está aprobado para publicación ni despliegue. No ejecutes el comando hasta que Javier confirme la publicación de una versión revisada y el primer arranque de `/claim` esté integrado y probado.

## Antes de empezar

1. Contrata un VPS KVM con Ubuntu o Debian (recomendados: 2 vCPU y 2 GB de RAM). Si quieres usar Hostinger, puedes hacerlo con el enlace de afiliado de ApliArte: https://hostinger.es?REFERRALCODE=APLIARTE.
2. Conserva la IP, el usuario de SSH y la contraseña o clave SSH que te dé Hostinger. No los publiques.
3. Si tienes un dominio, apunta su registro A a la IP del VPS y permite TCP 80 y 443 en el cortafuegos. **Con `--domain`, Caddy publica la aplicación completa**, incluido el panel. Espera a la revisión de seguridad pública antes de elegir esta opción.
4. El acceso sin dominio es privado mediante un túnel SSH. El puerto 7979 no se abre a Internet.

## Instalación, cuando exista una versión pública aprobada

En el terminal SSH del VPS, ejecuta el instalador de la **versión aprobada**. Comprueba antes que la URL y el contenido corresponden a esa versión; no ejecutes un script remoto que no hayas revisado. Ejemplo de forma de uso, no instrucción para ejecutarlo hoy:

```bash
curl -fsSL https://raw.githubusercontent.com/erbolamm/apliarte-directo/RELEASE_COMMIT_SHA/deploy/provision.sh | sudo bash -s -- --ref RELEASE_COMMIT_SHA
```

Con dominio y HTTPS (solo después de aprobar las rutas públicas):

```bash
curl -fsSL https://raw.githubusercontent.com/erbolamm/apliarte-directo/RELEASE_COMMIT_SHA/deploy/provision.sh | sudo bash -s -- --ref RELEASE_COMMIT_SHA --domain directo.ejemplo.com
```

Sustituye las dos apariciones de `RELEASE_COMMIT_SHA` por el mismo hash completo de 40 caracteres que publique Javier, y `directo.ejemplo.com` por tu dominio. El instalador usa el `docker-compose.yml` existente con una restricción VPS: el `docker-compose.yml` existente ata `overlay` a `127.0.0.1:7979`, incluso si Caddy ofrece HTTPS; un pequeño override solo ejecuta ese proceso sin root. Solo instala Docker Engine y el plugin Compose si faltan. El código queda en `/opt/apliarte-directo`; la configuración privada queda fuera de Git, en `/etc/apliarte-directo/install.env`, con permisos `0600`. Se conserva al actualizar. Nunca pegues claves en un chat.

**Sin dominio:** el instalador mostrará un comando de túnel como `ssh -L 7979:127.0.0.1:7979 USUARIO@IP_DEL_VPS`. Ejecútalo en el ordenador desde el que abrirás el navegador y mantén esa ventana abierta. Entra en `http://127.0.0.1:7979/`.

**Primera configuración:** si el servidor de la versión aprobada emite el enlace de reclamación, el instalador lo mostrará completo. Ábrelo tú solo en el navegador, a través del túnel o del dominio. Trátalo como una contraseña de un solo uso: no hagas capturas ni lo compartas. Si no aparece en 60 segundos, el instalador muestra cómo consultar los registros; esos registros también pueden contener el enlace privado. El servidor emite ese enlace desde el commit `e0234d2`. El instalador deja `PANEL_PASS` vacía a propósito: así el primer arranque genera el enlace, y quien lo abre primero recibe la contraseña del panel, que se muestra una sola vez. Las claves de emisión de Twitch y YouTube se pegan después en el panel, no en archivos.

Para actualizar, vuelve a ejecutar el instalador de una versión aprobada. Se detendrá si detecta cambios locales en el checkout, en vez de sobrescribirlos. No hagas `git push`, despliegues ni abras el repositorio al público por esta guía: sigue las puertas de `DOCUMENTATION/PUBLICATION-READINESS.md`.

## Prompt equivalente para Kodee

> Ayúdame a instalar ApliArte Directo en mi VPS KVM Ubuntu/Debian **solo cuando Javier haya aprobado una versión pública concreta**. Pídeme el `RELEASE_COMMIT_SHA`, la IP/usuario SSH y si deseo dominio. No te daré ni mostrarás contraseñas, tokens ni claves de emisión. Primero comprueba que la URL del script corresponde a la versión aprobada. Sin dominio, usa el instalador sin `--domain` y explícame el túnel SSH; con dominio, verifica DNS y puertos 80/443 y avísame de que el panel quedará públicamente accesible. No despliegues ni cambies visibilidad sin mi confirmación. Tras instalar, muéstrame únicamente el enlace privado de reclamación generado por el instalador y adviérteme que no lo comparta; si no aparece, dame el procedimiento de registros sin pegarlos en el chat.

Patrón de instalación de un solo comando inspirado en [AgentSystemLabs/agent-office, `deploy/provision.sh`](https://github.com/AgentSystemLabs/agent-office/blob/main/deploy/provision.sh) (MIT); adaptación para el stack Compose y las puertas de publicación de ApliArte Directo.
