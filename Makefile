archive.zip:
	git archive -v -o archive.zip --format=zip HEAD

clean:
	rm -f archive.zip