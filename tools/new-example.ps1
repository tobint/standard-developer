$experimentsPath = "..\experiments\"
$templatePath = "..\demo-template"

if( test-path $templatePath ) {
	write-host "Demo template found" -foregroundColor green
} else {
	write-host "Demo template cannot be found" -foregroundColor red
	return
}

do {
	$demoName = Read-Host "Demo Name "
} until ( $demoName ) 
$demoFolder = $demoName.Replace(" ", "-")

do {
	$demoCategory = Read-Host "Demo Category "
} until ( $demoCategory )

if( -Not ( test-path ($experimentsPath  + $demoCategory) ) ) {
	$demoPath = ($experimentsPath + $demoCategory + "\" + $demoFolder)

	Write-Host "Demo category not found. Creating: " + $demoPath -ForegroundColor yellow
	New-Item -ItemType directory -Path $demoPath

	Write-Host "Path created. Copying template. " -ForegroundColor yellow

	Copy-Item ($templatePath + "\*") -Destination ($demoPath)  -Exclude ".git*"
}

do {
	$demoDescription = Read-Host "Description "
} until ( $demoDescription ) 

do {
	$demoAuthor = Read-Host "Author "
} until ( $demoAuthor ) 

$content = (Get-Content ($demoPath + "\default.html")).Replace("{title}", $demoName).Replace("{author}", $demoAuthor).Replace("{description}", $demoDescription)

Set-Content -Path ($demoPath + "\default.html") -Value $content

