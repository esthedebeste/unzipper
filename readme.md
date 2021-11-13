# Unzipper

Util service to get a file from a zip without having to download the zip manually

Depends on 7z being installed and on the path.

Hosts an api with two query parameters

- ?url: the url to the zip file
- ?path: the path within the zip file

Example at: https://unzipped.herokuapp.com/?url=https://raw.githubusercontent.com/tbhmens/unzipper/main/example.zip&path=example.txt
