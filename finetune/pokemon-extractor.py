import sys
import os
from pyspark.sql import SparkSession

os.makedirs("pokemon", exist_ok=True)

spark = SparkSession.builder.appName("PokemonExtractor").getOrCreate()
df = spark.read.parquet(sys.argv[1])

# the file has two columns, "image" and "text". "image" is jpg data, "text" is the text description of the image
# we want to extract the image data and save it to a file with row number as the filename

# do it
for i, row in enumerate(df.collect()):
    with open(f"pokemon/{i}.jpg", "wb") as f:
        f.write(row.image[0])
    with open(f"pokemon/{i}.caption", "w") as f:
        f.write(row.text)
    print(f"Extracted {i} images")
