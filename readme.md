# Unzipper

Util service to get a file from a zip without having to download the zip manually

Depends on 7z being installed and on the path.

Hosts an api with two query parameters

- ?url: the url to the zip file
- ?path: the path within the zip file

Example: http://localhost:8080/?url=https://raw.githubusercontent.com/tbhmens/unzipper/example.zip&path=example.txt
